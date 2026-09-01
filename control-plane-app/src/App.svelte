<script lang="ts">
  import { onMount, tick } from "svelte";
  import { demoBanner, sourceForLocation } from "./data-source.js";
  import { resolveCapabilityQuery } from "./domain.js";
  import { ALL_CAPABILITY_DEFINITIONS, CAPABILITY_DEFINITIONS } from "../../src/control-plane/contracts/capability-taxonomy.js";
  import { CONTROL_PLANE_SNAPSHOT_SCHEMA_VERSION } from "../../src/control-plane/contracts/snapshot.js";
  import type { CapabilitySelection } from "../../src/control-plane/domain/ranking.js";
  import { applyTheme, DEFAULT_THEME, OKOA_THEMES, parsePersistedTheme, persistTheme, type OkoaTheme } from "./theme.js";
  import { themeStorage } from "./theme-storage.js";
  import { PRODUCT_INTRO_GROUPS, PRODUCT_INTRO_STORAGE_KEY } from "./product-intro.js";
  import { bestValueAgent, currentNoHarm, cycleCapabilityWeight, debtFlowShare, dependencyClosure, formatAgentTuple, groupSnapshotAgents, knownNowIssueIds, manifestBinding, planSnapshotIssues, preferredCapabilityScore, primaryQualification, projectInventoryAgents, projectWorkbenchIssues, rankSnapshotAgents, terminalVerdict, type ControlPlaneSnapshot, type InventorySort, type Objective, type PlannedSnapshotIssue, type SnapshotAgent, type SnapshotComplexity, type SnapshotRun, type SnapshotIssue, type SnapshotStatus, type WorkbenchSort } from "./read-model.js";

  type View = "Progress / Command" | "Issues / Remediation" | "Agent Finder" | "Team Roster" | "Raw Agent Inventory" | "Run History" | "System / Method";
  const views: readonly View[] = ["Progress / Command", "Issues / Remediation", "Agent Finder", "Team Roster", "Raw Agent Inventory", "Run History", "System / Method"];
  export let initialSnapshot: ControlPlaneSnapshot | null = null;
  export let initialView: View = "Progress / Command";
  const objectives: readonly { id: Objective; label: string }[] = [
    { id: "default", label: "Balanced" }, { id: "severity", label: "Severity" }, { id: "difficulty", label: "Difficulty" }, { id: "unlock", label: "Unlock value" }, { id: "risk", label: "Regression risk" },
  ];
  const workbenchSorts: readonly { id: WorkbenchSort; label: string }[] = [
    { id: "plan", label: "DAG order" }, { id: "severity", label: "Severity" }, { id: "difficulty", label: "Difficulty" }, { id: "age", label: "Age" }, { id: "confidence", label: "Low confidence" }, { id: "domain", label: "Domain" }, { id: "owner", label: "Owner" },
  ];
  const inventorySorts: readonly { id: InventorySort; label: string }[] = [
    { id: "model", label: "Model" }, { id: "harness", label: "Harness" }, { id: "reasoning_level", label: "Reasoning" }, { id: "qualification", label: "Qualification" }, { id: "capability", label: "Capability score" }, { id: "samples", label: "Samples" }, { id: "success", label: "Success" }, { id: "reliability", label: "Reliability" }, { id: "cost", label: "Cost" }, { id: "speed", label: "Speed" }, { id: "inference", label: "Inference" }, { id: "headless", label: "Headless" }, { id: "local", label: "Local" }, { id: "familiarity", label: "Familiarity" }, { id: "availability", label: "Availability" },
  ];
  let activeView: View = initialView;
  let objective: Objective = "default";
  let snapshot: ControlPlaneSnapshot | null = initialSnapshot;
  let status: SnapshotStatus = initialSnapshot === null ? "loading" : "ready";
  let errorMessage = "";
  let selectedIssueIds: string[] = [];
  let capabilityWeights: Record<string, number> = {};
  let query = "";
  let capabilityMessage = "";
  let copyMessage = "";
  let detailsIssueId: string | null = null;
  let workbenchSort: WorkbenchSort = "plan";
  let issueQuery = "";
  let issueDomain = "";
  let issueOwner = "";
  let issueState = "";
  let inventorySort: InventorySort = "model";
  let inventoryQuery = "";
  let inventoryHarness = "";
  let inventoryAvailability = "";
  let inventoryCapability = "";
  let inventoryPage = 1;
  let inventoryFilterFingerprint = "";
  const inventoryPageSize = 6;
  let historySort: "observed_at" | "remaining" | "caused" = "observed_at";
  let theme: OkoaTheme = DEFAULT_THEME;
  let mainElement: HTMLElement;
  let mobileNavElement: HTMLDetailsElement;
  let introDialogElement: HTMLDialogElement;
  let introReturnFocusElement: HTMLElement | null = null;
  let introOpen = false;
  let introScrollLock: {
    readonly scrollX: number;
    readonly scrollY: number;
    readonly bodyTop: string;
  } | null = null;

  $: planning = snapshot ? planSnapshotIssues(snapshot.issues, objective) : null;
  $: plannedIssues = planning?.items ?? [];
  $: issueDomains = [...new Set((snapshot?.issues ?? []).map((issue) => issue.debt_domain))].sort();
  $: issueOwners = [...new Set((snapshot?.issues ?? []).map((issue) => issue.owner))].sort();
  $: issueStates = [...new Set((snapshot?.issues ?? []).map((issue) => issue.state))].sort();
  $: workbenchIssues = projectWorkbenchIssues(plannedIssues, snapshot?.runs ?? [], { sort: workbenchSort, query: issueQuery, domain: issueDomain, owner: issueOwner, state: issueState });
  $: selectedClosure = snapshot ? dependencyClosure(snapshot.issues, selectedIssueIds) : [];
  $: selectedIssues = plannedIssues.filter((issue) => selectedClosure.includes(issue.issue_id));
  $: selections = Object.entries(capabilityWeights).filter(([, weight]) => weight > 0).map(([capability_id, weight]) => ({ capability_id, weight }) as CapabilitySelection);
  $: matchingAgents = snapshot?.agents ?? [];
  $: ranked = snapshot && selections.length > 0 ? rankSnapshotAgents(matchingAgents, selections) : { ranked: [], excluded: [] };
  $: inventoryHarnesses = [...new Set((snapshot?.agents ?? []).map((agent) => agent.harness))].sort();
  $: inventoryAvailabilities = [...new Set((snapshot?.agents ?? []).map((agent) => agent.availability))].sort();
  $: allSortedAgents = projectInventoryAgents(snapshot?.agents ?? [], { sort: inventorySort, query: inventoryQuery, harness: inventoryHarness, availability: inventoryAvailability, capability: inventoryCapability });
  $: {
    const nextInventoryFilterFingerprint = [inventorySort, inventoryQuery, inventoryHarness, inventoryAvailability, inventoryCapability].join("\u0000");
    if (inventoryFilterFingerprint !== nextInventoryFilterFingerprint) {
      inventoryFilterFingerprint = nextInventoryFilterFingerprint;
      inventoryPage = 1;
    }
  }
  $: inventoryPageCount = Math.max(1, Math.ceil(allSortedAgents.length / inventoryPageSize));
  $: if (inventoryPage > inventoryPageCount) inventoryPage = inventoryPageCount;
  $: sortedAgents = allSortedAgents.slice((inventoryPage - 1) * inventoryPageSize, inventoryPage * inventoryPageSize);
  $: rosterGroups = groupSnapshotAgents(snapshot?.agents ?? []);
  $: bestValue = bestValueAgent(ranked.ranked.map((item) => item.agent));
  $: sortedRuns = [...(snapshot?.runs ?? [])].sort((left, right) => historySort === "observed_at" ? right.observed_at.localeCompare(left.observed_at) : historySort === "remaining" ? right.debt_flow.ending_real_issues - left.debt_flow.ending_real_issues : right.debt_flow.caused_by_remediation - left.debt_flow.caused_by_remediation);
  $: directiveText = buildDirective(selectedIssues, snapshot);
  $: demoNotice = snapshot ? demoBanner(snapshot) : null;
  $: terminal = snapshot ? terminalVerdict(snapshot) : null;
  $: payableIssues = (snapshot?.issues ?? []).filter((issue) => issue.state !== "paid" && issue.state !== "false_positive");
  $: technicalDebt = payableIssues.filter((issue) => issue.technical_or_agentic === "technical").length;
  $: agenticDebt = payableIssues.filter((issue) => issue.technical_or_agentic === "agentic_operational").length;
  $: meanIssueConfidence = payableIssues.length === 0 ? null : payableIssues.reduce((sum, issue) => sum + issue.confidence, 0) / payableIssues.length;
  $: activeAgents = (snapshot?.agents ?? []).filter((agent) => agent.active_in_repository);
  $: activeControlSurfaces = new Set(activeAgents.map((agent) => agent.control_surface).filter((surface): surface is string => surface !== null)).size;
  $: currentWorktrees = new Set((snapshot?.issues ?? []).map((issue) => issue.worktree).filter((worktree): worktree is string => worktree !== null)).size;
  $: unboundActiveAgents = activeAgents.filter((agent) => agent.execution_identity.disposition !== "BOUND_FOR_DISPATCH" && agent.execution_identity.disposition !== "BOUND_FOR_EVALUATION").length;
  $: currentRun = snapshot?.runs.find((run) => run.run_id === snapshot?.current_run_id) ?? null;
  $: sizeHistorySeries = snapshot?.complexity.repository_size_history ?? [];

  onMount(() => {
    theme = parsePersistedTheme(document.documentElement.dataset.style);
    applyTheme(theme, document.documentElement);
    if (window.localStorage.getItem(PRODUCT_INTRO_STORAGE_KEY) !== "seen") void openProductIntro();
    if (initialSnapshot === null) void loadSnapshot();
    return releaseProductIntroScrollLock;
  });

  function acquireProductIntroScrollLock(): void {
    if (introScrollLock !== null) return;
    const root = document.documentElement;
    const body = document.body;
    introScrollLock = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      bodyTop: body.style.top,
    };
    root.dataset.productIntroOpen = "true";
    body.dataset.productIntroOpen = "true";
    root.dataset.productIntroScrollX = String(introScrollLock.scrollX);
    root.dataset.productIntroScrollY = String(introScrollLock.scrollY);
    body.style.top = `${-introScrollLock.scrollY}px`;
  }

  function releaseProductIntroScrollLock(): void {
    if (introScrollLock === null) return;
    const root = document.documentElement;
    const body = document.body;
    const lock = introScrollLock;
    introScrollLock = null;
    delete root.dataset.productIntroOpen;
    delete body.dataset.productIntroOpen;
    delete root.dataset.productIntroScrollX;
    delete root.dataset.productIntroScrollY;
    if (lock.bodyTop.length === 0) body.style.removeProperty("top");
    else body.style.top = lock.bodyTop;
    window.scrollTo({ left: lock.scrollX, top: lock.scrollY, behavior: "auto" });
  }

  async function openProductIntro(): Promise<void> {
    const activeElement = document.activeElement;
    introReturnFocusElement = activeElement instanceof HTMLElement
      && activeElement !== document.body
      && !introDialogElement?.contains(activeElement)
      ? activeElement
      : document.querySelector<HTMLElement>(".header-action");
    acquireProductIntroScrollLock();
    introOpen = true;
    try {
      await tick();
      if (!introDialogElement.open) introDialogElement.showModal();
      await tick();
      introFocusableElements()[0]?.focus({ preventScroll: true });
    } catch (error) {
      introOpen = false;
      releaseProductIntroScrollLock();
      throw error;
    }
  }

  async function closeProductIntro(): Promise<void> {
    const returnTarget = introReturnFocusElement?.isConnected
      ? introReturnFocusElement
      : document.querySelector<HTMLElement>(".header-action");
    window.localStorage.setItem(PRODUCT_INTRO_STORAGE_KEY, "seen");
    if (introDialogElement.open) introDialogElement.close();
    introOpen = false;
    await tick();
    releaseProductIntroScrollLock();
    returnTarget?.focus({ preventScroll: true });
    introReturnFocusElement = null;
  }

  function introFocusableElements(): HTMLElement[] {
    if (!introDialogElement) return [];
    return [...introDialogElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute("hidden")
      && element.getAttribute("aria-hidden") !== "true"
      && (element.offsetWidth > 0 || element.offsetHeight > 0));
  }

  function trapIntroFocus(event: KeyboardEvent): void {
    if (event.key !== "Tab" || !introDialogElement.open) return;
    const focusable = introFocusableElements();
    if (focusable.length === 0) return;
    const currentIndex = document.activeElement instanceof HTMLElement
      ? focusable.indexOf(document.activeElement)
      : -1;
    const nextIndex = event.shiftKey
      ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
      : currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
    event.preventDefault();
    focusable[nextIndex]?.focus({ preventScroll: true });
  }

  function changeTheme(value: string): void {
    theme = parsePersistedTheme(value);
    applyTheme(theme, document.documentElement);
    persistTheme(themeStorage(), theme);
  }

  async function changeView(view: View): Promise<void> {
    activeView = view;
    mobileNavElement.open = false;
    await tick();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    mainElement.focus({ preventScroll: true });
  }

  async function loadSnapshot(): Promise<void> {
    status = "loading";
    errorMessage = "";
    try {
      snapshot = await sourceForLocation(window.location.search).load();
      // A valid zero-issue snapshot is still a complete control-plane state.
      // Every view must render it without turning absence of debt into absence
      // of evidence or silently inferring CLEAN.
      status = "ready";
      selectedIssueIds = [];
    } catch (error) {
      snapshot = null;
      status = "error";
      errorMessage = error instanceof Error ? error.message : "The local evidence snapshot could not be read.";
    }
  }

  function toggleIssue(issue: SnapshotIssue): void {
    selectedIssueIds = selectedIssueIds.includes(issue.issue_id)
      ? selectedIssueIds.filter((id) => id !== issue.issue_id && !issue.dependent_issue_ids.includes(id))
      : [...new Set([...selectedIssueIds, ...dependencyClosure(snapshot?.issues ?? [], [issue.issue_id])])];
  }

  function cycleCapability(id: string): void {
    const definition = ALL_CAPABILITY_DEFINITIONS.find((item) => item.id === id);
    const weight = cycleCapabilityWeight(capabilityWeights[id] ?? 0);
    capabilityWeights = { ...capabilityWeights, [id]: weight };
    capabilityMessage = weight === 0 ? `${definition?.label ?? id} removed.` : `${definition?.label ?? id} weighted ${weight}.`;
  }

  function addCapabilityFromQuery(): void {
    const definition = resolveCapabilityQuery(query);
    if (!definition) {
      capabilityMessage = "Choose an exact capability from the suggestions.";
      return;
    }
    const weight = cycleCapabilityWeight(capabilityWeights[definition.id] ?? 0);
    capabilityWeights = { ...capabilityWeights, [definition.id]: weight };
    capabilityMessage = weight === 0 ? `${definition.label} removed.` : `${definition.label} weighted ${weight}.`;
    query = "";
  }

  function capabilityQueryKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCapabilityFromQuery();
  }

  function selectedScore(agent: SnapshotAgent, id: string) { return agent.capability_scores.find((score) => score.capability_id === id) ?? null; }

  function capabilityForIssue(issue: SnapshotIssue): string {
    const domain = issue.debt_domain.toLocaleLowerCase();
    if (domain.includes("planning")) return "planning_projection_reconciliation";
    if (domain.includes("git")) return "git_worktree_integration_hygiene";
    if (domain.includes("release") || domain.includes("ci")) return "ci_cd_release_deployment_remediation";
    if (domain.includes("complexity") || domain.includes("architecture")) return "architecture_coherence_complexity_reduction";
    if (domain.includes("security") || domain.includes("secret")) return "security_secrets_dependency_remediation";
    return "code_correctness_remediation";
  }

  function issueRouting(issue: SnapshotIssue) {
    return rankSnapshotAgents(snapshot?.agents ?? [], [{ capability_id: capabilityForIssue(issue), weight: 1 } as CapabilitySelection]);
  }

  function issueAge(issue: SnapshotIssue): string {
    const first = snapshot?.runs.find((run) => run.run_id === issue.first_detected_run_id);
    return first ? `${issue.first_detected_run_id} · ${first.observed_at}` : `${issue.first_detected_run_id} · date unavailable`;
  }

  function percent(value: number | null): string { return value === null ? "NOT MEASURED" : `${(value * 100).toFixed(1)}%`; }
  function numberMetric(value: number | null, suffix = ""): string { return value === null ? "NOT MEASURED" : `${value.toLocaleString()}${suffix}`; }
  function formatBytes(value: number): string { return `${(value / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`; }
  function availabilityLabel(value: SnapshotComplexity["availability"]): string { return value.replaceAll("_", " "); }
  function measuredComplexity(value: number): string {
    return snapshot?.complexity.availability === "MEASURED" ? value.toLocaleString() : availabilityLabel(snapshot?.complexity.availability ?? "UNKNOWN");
  }
  function complexityRatio(value: number | null): string {
    return snapshot?.complexity.availability === "MEASURED" && value !== null ? `${Math.round(value * 100)}%` : availabilityLabel(snapshot?.complexity.availability ?? "UNKNOWN");
  }
  function complexityFunction(value: number | null): string {
    return snapshot?.complexity.availability === "MEASURED" && value !== null ? value.toLocaleString() : availabilityLabel(snapshot?.complexity.availability ?? "UNKNOWN");
  }
  function complexitySurface(value: SnapshotComplexity["authored_source"]): string {
    return snapshot?.complexity.availability === "MEASURED"
      ? `${value.files.toLocaleString()} files · ${formatBytes(value.bytes)} · ${value.lines.toLocaleString()} lines`
      : availabilityLabel(snapshot?.complexity.availability ?? "UNKNOWN");
  }
  function ignoredSurface(value: SnapshotComplexity["ignored_live"]["total"]): string {
    return snapshot?.complexity.ignored_live.availability === "MEASURED"
      ? `${value.files.toLocaleString()} files · ${formatBytes(value.bytes)} · ${value.lines.toLocaleString()} lines`
      : availabilityLabel(snapshot?.complexity.ignored_live.availability ?? "UNKNOWN");
  }
  function sizePolyline(points: NonNullable<SnapshotComplexity["repository_size_history"]>[number]["points"]): string {
    if (points.length === 0) return "";
    const values = points.map((point) => point.bytes);
    const minimum = Math.min(...values);
    const range = Math.max(1, Math.max(...values) - minimum);
    return points.map((point, index) => `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${34 - ((point.bytes - minimum) / range) * 30}`).join(" ");
  }
  function humanState(value: string): string {
    return value.split("_").map((part) => part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`).join(" ");
  }

  function humanText(value: string): string {
    return value.replaceAll(/\b(?:Recommended_supervised|Production_cleared|[A-Za-z][A-Za-z0-9]*_[A-Za-z][A-Za-z0-9_]+)\b/g, (state) => humanState(state));
  }

  function qualificationLabel(value: string): string {
    const labels: Readonly<Record<string, string>> = {
      Recommended_supervised: "Recommended · supervised",
      Production_cleared: "Production-cleared",
      Qualified: "Qualified",
      EVALUATING: "Evaluating",
      UNTESTED: "Untested",
      DISQUALIFIED: "Disqualified",
    };
    return labels[value] ?? humanState(value);
  }

  const themeGroups = [...new Set(OKOA_THEMES.map((item) => item.family))]
    .map((family) => ({ label: family, themes: OKOA_THEMES.filter((item) => item.family === family) }));

  function buildDirective(issues: readonly PlannedSnapshotIssue[], current: ControlPlaneSnapshot | null): string {
    if (!current) return "ADVISE PREVIEW — UNBOUND\nNo repository evidence is loaded.";
    const binding = manifestBinding(current, issues.map((issue) => issue.issue_id));
    if (!binding.bound || !current.manifest) return ["ADVISE PREVIEW — UNBOUND", `Repository: ${current.repository}; run: ${current.current_run_id}.`, `Selected issues: ${issues.map((issue) => `${issue.issue_id} — ${issue.title}`).join("; ") || "none"}.`, `Unbound reason: ${binding.reasons.join("; ")}.`, "No manifest, delivery, execution, or verification claim is made.", "Boundary: copyable recommendation only; no route admission or external action."].join("\n");
    return ["MANIFEST-BOUND ADVISE PROJECTION", `Manifest: ${current.manifest.manifest_id} · revision ${current.manifest.revision} · ${current.manifest.digest}`, `Issue graph: ${current.manifest.issue_graph.issue_graph_id} v${current.manifest.issue_graph.version} · ${current.manifest.issue_graph.digest}`, `Projection digest: ${current.manifest.projection_digest}`, `Repository object: ${current.manifest.subject.repository_object_sha256}; target ${current.manifest.target_ref} @ ${current.manifest.expected_target_commit}.`, `Selected issues: ${current.manifest.selected_issue_ids.join(", ")}.`, `Directive: ${current.manifest.directive_id} · state ${current.manifest.directive_state}.`, `Authority: ${current.manifest.authority_mode}; receipt boundary: ${current.manifest.receipt_boundary}.`].join("\n");
  }

  async function copyDirective(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard permission is unavailable in this browser context.");
      await navigator.clipboard.writeText(directiveText);
      copyMessage = "Copied successfully. This does not mean delivered.";
    } catch (error) {
      copyMessage = error instanceof Error ? error.message : "Clipboard write failed; nothing was copied.";
    }
  }

  function runLabel(run: SnapshotRun): string { return `${run.run_id} · ${run.mister_clean_version} · ${run.detector_version}`; }
</script>

<svelte:head><title>Mister Clean · Control Plane</title></svelte:head>

<div class="app-shell">
  <header class="topbar">
    <svg class="product-mark" viewBox="0 0 64 64" role="img" aria-label="Repository paths converging through a clean passage"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="6"><path d="M8 14h13c9 0 9 12 18 12h8"></path><path d="M8 50h13c9 0 9-12 18-12h8"></path><path d="M49 12h7v14"></path><path d="M49 52h7V38"></path></g><path d="M8 32h48" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="6" opacity=".72"></path></svg>
    <div><p class="eyebrow">Operational control</p><h1 class="product-title">Mister Clean</h1></div>
    {#if snapshot}<p class="product-meta">{snapshot.repository} · {snapshot.current_run_id}</p>{/if}
    <button type="button" class="header-action" onclick={() => void openProductIntro()}>What it does</button>
    <label class="theme-picker"><span>OKOA theme</span><span class="select-shell"><select value={theme} onchange={(event) => changeTheme((event.currentTarget as HTMLSelectElement).value)} aria-label="Choose OKOA theme">{#each themeGroups as group}<optgroup label={group.label}>{#each group.themes as option}<option value={option.id}>{option.label}</option>{/each}</optgroup>{/each}</select></span></label>
  </header>
  {#if introOpen}
    <dialog class="intro-dialog" bind:this={introDialogElement} aria-labelledby="intro-title" aria-modal="true" onkeydown={trapIntroFocus} oncancel={(event) => { event.preventDefault(); void closeProductIntro(); }}>
      <div class="intro-shell">
        <header class="intro-header">
          <div>
            <p class="eyebrow">First, do no harm · then pay the debt</p>
            <h2 id="intro-title">What Mister Clean does</h2>
          </div>
          <button type="button" class="control intro-dismiss" onclick={() => void closeProductIntro()} aria-label="Close introduction">Close</button>
        </header>
        <p class="intro-statement">Mister Clean audits and remediates the entire repository handoff surface—not just source code—until code, planning, Git, verification, and agent operations are coherent and successor-ready. It pays discoverable debt, prevents cleanup from causing new debt, and refuses <strong>CLEAN</strong> until the exact current repository object satisfies the terminal contract.</p>
        <div class="intro-principles" aria-label="Mister Clean governing principles">
          <span><strong>Pay the debt</strong> · do not turn payable work into a queue for the next team.</span>
          <span><strong>Do no harm</strong> · caused-by-remediation debt is a regression, not an acceptable trade.</span>
          <span><strong>Bind the claim</strong> · green checks do not replace exact-object evidence.</span>
        </div>
        <div class="intro-grid" aria-label="Repository issue domains Mister Clean resolves">
          {#each PRODUCT_INTRO_GROUPS as group, index}
            <article class="intro-card"><span class="intro-index">{String(index + 1).padStart(2, "0")}</span><div><h3>{group.title}</h3><p>{group.summary}</p></div></article>
          {/each}
        </div>
        <footer class="intro-footer"><p>This introduction is always available from <strong>What it does</strong>.</p><button type="button" class="control active" onclick={() => void closeProductIntro()}>Open the control plane</button></footer>
      </div>
    </dialog>
  {/if}
  {#if demoNotice}<div class="demo-banner" role="status">{demoNotice}</div>{/if}
  <details class="mobile-nav" bind:this={mobileNavElement}>
    <summary>View · {activeView}</summary>
    <nav aria-label="Control-plane views"><ul class="nav-list">{#each views as view}<li><button class="nav-button" aria-current={activeView === view ? "page" : undefined} onclick={() => void changeView(view)}>{view}</button></li>{/each}</ul></nav>
  </details>
  <div class="layout">
    <aside class="sidebar" aria-label="Control-plane views">
      <ul class="nav-list">{#each views as view}<li><button class="nav-button" aria-current={activeView === view ? "page" : undefined} onclick={() => void changeView(view)}>{view}</button></li>{/each}</ul>
    </aside>
    <main class="main" bind:this={mainElement} tabindex="-1" aria-label={activeView}>
      {#if status === "loading"}<section class="loading-state" aria-live="polite"><p class="eyebrow">Synchronizing evidence</p><div class="skeleton"></div><div class="skeleton"></div></section>
      {:else if status === "error"}<section class="error-state" aria-live="assertive"><h2 class="view-heading">Evidence could not be read</h2><p class="view-lead">{errorMessage}. No cleanliness verdict is available.</p><button class="control active" onclick={() => void loadSnapshot()}>Retry local query</button></section>
      {:else if snapshot}
        {#if activeView === "Progress / Command"}
          <p class="eyebrow">Repository state · {snapshot.current_subject.observed_at}</p><h2 class="view-heading">Are we moving closer?</h2><p class="view-lead">The headline is calculated from one identity-bound debt flow. Detection expansion, classification, and remediation harm remain separate.</p>
          <section class="hero" aria-label="Current progress">
            <div class="hero-copy">
              <p class="eyebrow">Outstanding real issues</p>
              <p class="hero-number">{snapshot.current_flow.ending_real_issues}<small>{terminal?.verdict === "CLEAN" ? "CLEAN" : `NOT CLEAN · ${terminal?.evidence_state ?? "UNKNOWN"}`} · terminal contract projection</small></p>
              <span class:no-harm-fail={!currentNoHarm(snapshot)} class="status-pass">No-harm: {currentNoHarm(snapshot) ? "holding" : "failed"}</span>
              <p class="view-lead">{snapshot.current_flow.ending_real_issues} payable issues remain. {snapshot.current_flow.caused_by_remediation} caused by remediation. {snapshot.current_flow.boundary_blocked} boundary-blocked.</p>
              {#if terminal?.reasons.length}
                <section class="blocker-preview" aria-labelledby="terminal-blockers-title">
                  <p class="eyebrow" id="terminal-blockers-title">Top terminal blockers</p>
                  <ul class="terminal-reason-list">{#each terminal.reasons.slice(0, 3) as reason}<li>{humanText(reason)}</li>{/each}</ul>
                  {#if terminal.reasons.length > 3}
                    <details class="terminal-reasons disclosure">
                      <summary>{terminal.reasons.length - 3} more blockers</summary>
                      <ul class="terminal-reason-list">{#each terminal.reasons.slice(3) as reason}<li>{humanText(reason)}</li>{/each}</ul>
                    </details>
                  {/if}
                </section>
              {/if}
            </div>
            <div class="hero-figure">
              <p class="eyebrow">Debt flow · {snapshot.current_run_id}</p>
              <div class="flow">{#each [["Starting", snapshot.current_flow.starting_real_issues], ["Discovered pre-existing", snapshot.current_flow.discovered_preexisting], ["Caused", snapshot.current_flow.caused_by_remediation], ["Paid", snapshot.current_flow.paid], ["Remaining", snapshot.current_flow.ending_real_issues], ["Blocked", snapshot.current_flow.boundary_blocked]] as term}<div class="flow-cell"><strong>{term[1]}</strong><span>{term[0]}</span></div>{/each}</div>
              <details class="flow-adjustments disclosure">
                <summary>Accounting adjustments · 3</summary>
                <div class="flow">{#each [["Concurrent", snapshot.current_flow.concurrently_introduced], ["Invalidated false positives", snapshot.current_flow.invalidated_false_positives], ["Corrections", snapshot.current_flow.classification_correction_delta]] as term}<div class="flow-cell"><strong>{term[1]}</strong><span>{term[0]}</span></div>{/each}</div>
              </details>
              <div class="debt-lanes" aria-label="Debt-flow magnitudes relative to the current run scope">
                {#each [["Discovered", snapshot.current_flow.discovered_preexisting, "discovered"], ["Paid", snapshot.current_flow.paid, "paid"], ["Caused", snapshot.current_flow.caused_by_remediation, "caused"], ["Blocked", snapshot.current_flow.boundary_blocked, "blocked"]] as lane}
                  <div class="debt-lane"><span>{lane[0]} · {lane[1]}</span><div class={`debt-track debt-${lane[2]}`}><i style={`--debt-share: ${debtFlowShare(Number(lane[1]), snapshot.current_flow)}%`}></i></div></div>
                {/each}
              </div>
              <p class="muted">No-harm is {currentNoHarm(snapshot) ? "holding" : "failed"}; the same object digest binds this reading.</p>
            </div>
          </section>
          <div class="metric-grid"><div class="metric"><strong>{snapshot.first_flow?.ending_real_issues ?? "NOT MEASURED"}</strong><span>First run</span></div><div class="metric"><strong>{snapshot.previous_flow?.ending_real_issues ?? "NOT MEASURED"}</strong><span>Previous run</span></div><div class="metric"><strong>{snapshot.current_flow.ending_real_issues}</strong><span>Current run</span></div><div class="metric"><strong>{snapshot.current_flow.paid}</strong><span>Paid this run</span></div></div>
          <section class="section split" aria-label="Debt composition and operating posture">
            <div class="panel"><h3>Debt composition and confidence</h3><ul class="list"><li><span>Technical</span><strong>{technicalDebt} payable roots</strong></li><li><span>Agentic / operational</span><strong>{agenticDebt} payable roots</strong></li><li><span>Mean issue confidence</span><strong>{percent(meanIssueConfidence)}</strong></li><li><span>Evidence state</span><strong>{terminal?.evidence_state ?? "UNKNOWN"}</strong></li></ul></div>
            <div class="panel"><h3>Team, topology, and authority</h3><ul class="list"><li><span>Active repository agents</span><strong>{activeAgents.length}</strong></li><li><span>Configured control surfaces</span><strong>{activeControlSurfaces}</strong></li><li><span>Declared issue worktrees</span><strong>{currentWorktrees}</strong></li><li><span>Unbound active identities</span><strong>{unboundActiveAgents}</strong></li><li><span>Authority / mode</span><strong>{snapshot.current_authority} · {snapshot.manifest?.directive_state ?? "unbound preview"}</strong></li><li><span>Branch / target</span><strong>{snapshot.current_subject.branch} · {snapshot.manifest?.target_ref ?? "no manifest target"}</strong></li></ul></div>
          </section>
          <section class="section"><h3 class="section-title">Recommended next wave</h3><p class="section-caption">Deterministic dependency planning over the current issue graph. Select issues in the workbench to build a dependency-closed ADVISE projection.</p><div class="split"><div class="panel"><ol class="list">{#each plannedIssues.slice(0, 3) as issue}<li><div><span class="eyebrow">{issue.issue_id} · {issue.plan.concurrency}</span><strong>{issue.title}</strong><p class="muted">{issue.recommended_tuple}</p></div><span class="status-info">{issue.plan.order || "blocked"}</span></li>{/each}</ol></div><div class="panel"><h3>Directive boundary</h3><p class="muted">{snapshot.manifest ? "Manifest-bound projection." : "Unbound ADVISE preview. Queue and delivery claims are prohibited."}</p><button class="control active" onclick={copyDirective}>Copy {snapshot.manifest ? "manifest projection" : "ADVISE preview"}</button>{#if copyMessage}<p class="notice" role="status">{copyMessage}</p>{/if}</div></div></section>
          <section class="section"><h3 class="section-title">Complexity &amp; shipping balance</h3><p class="section-caption">Repository-object, tracked, authored, generated, documentation, dependency, and ignored-live surfaces remain distinct. Thresholds are policy choices, not industry truth.</p><div class="metric-grid"><div class="metric"><strong>{measuredComplexity(snapshot.complexity.tracked_object.bytes)}</strong><span>Tracked object bytes</span></div><div class="metric"><strong>{measuredComplexity(snapshot.complexity.authored_source.lines)}</strong><span>Authored source lines</span></div><div class="metric"><strong>{complexityRatio(snapshot.complexity.docs_to_authored_code.lines)}</strong><span>Docs:code lines</span></div><div class="metric"><strong>{complexityFunction(snapshot.complexity.functions.p95)}</strong><span>Function p95</span></div></div>
            <details class="panel disclosure"><summary>Repository-object surface inventory</summary><p class="muted">The exact repository object includes tracked plus nonignored-untracked material. Ignored-live material is a separate, time-bound worktree observation and is never counted as part of the object.</p><ul class="list"><li><span>Repository object total</span><strong>{complexitySurface(snapshot.complexity.repository_object_total)}</strong></li><li><span>Tracked object</span><strong>{complexitySurface(snapshot.complexity.tracked_object)}</strong></li><li><span>Untracked, nonignored</span><strong>{complexitySurface(snapshot.complexity.untracked_nonignored)}</strong></li><li><span>Authored source</span><strong>{complexitySurface(snapshot.complexity.authored_source)}</strong></li><li><span>Tests</span><strong>{complexitySurface(snapshot.complexity.tests)}</strong></li><li><span>Public documentation</span><strong>{complexitySurface(snapshot.complexity.public_documentation)}</strong></li><li><span>Planning documentation</span><strong>{complexitySurface(snapshot.complexity.planning_documentation)}</strong></li><li><span>Generated, shippable</span><strong>{complexitySurface(snapshot.complexity.generated_shippable)}</strong></li><li><span>Configuration and tooling</span><strong>{complexitySurface(snapshot.complexity.config_tooling)}</strong></li><li><span>Evidence and research</span><strong>{complexitySurface(snapshot.complexity.evidence_research)}</strong></li><li><span>Dependencies and assets</span><strong>{complexitySurface(snapshot.complexity.dependencies_assets)}</strong></li></ul><h4>Ignored-live classes · {availabilityLabel(snapshot.complexity.ignored_live.availability)}</h4><p class="muted">Observed {snapshot.complexity.ignored_live.observed_at ?? "NOT MEASURED"} · relation {humanState(snapshot.complexity.ignored_live.subject_relation)}.</p><ul class="list"><li><span>Ignored total</span><strong>{ignoredSurface(snapshot.complexity.ignored_live.total)}</strong></li><li><span>Dependencies</span><strong>{ignoredSurface(snapshot.complexity.ignored_live.dependencies)}</strong></li><li><span>Build cache</span><strong>{ignoredSurface(snapshot.complexity.ignored_live.build_cache)}</strong></li><li><span>Local evidence</span><strong>{ignoredSurface(snapshot.complexity.ignored_live.local_evidence)}</strong></li><li><span>Other</span><strong>{ignoredSurface(snapshot.complexity.ignored_live.other)}</strong></li></ul></details>
            <details class="panel disclosure"><summary>Object binding, coverage, limits, and longitudinal trend</summary><p class="muted">Availability: {availabilityLabel(snapshot.complexity.availability)} · object: {snapshot.complexity.object_sha256 ?? "UNKNOWN"}</p><p>{snapshot.complexity.structural_coverage}</p><p class="muted">{snapshot.complexity.limitations.join(" ")}</p><p class="tuple">Cycles: {snapshot.complexity.cycles.join("; ") || "none measured"}. Hotspots: {snapshot.complexity.hotspots.join("; ") || "none measured"}.</p>{#if snapshot.complexity.trend.length === 0}<p class="muted">Longitudinal complexity is NOT MEASURED.</p>{:else}<ul class="list">{#each snapshot.complexity.trend as point}<li><span>{point.run_id} · {point.object_sha256}</span><strong>{point.complexity ?? "NOT MEASURED"} complexity · {point.docs_to_code_lines === null ? "NOT MEASURED" : `${Math.round(point.docs_to_code_lines * 100)}%`} docs:code</strong></li>{/each}</ul>{/if}</details></section>
          <section class="section size-history"><h3 class="section-title">Repository size by commit</h3><p class="section-caption">Tracked repository bytes are a sprawl signal, not an authored-complexity score. Every series names its actual ref and head; no branch is relabeled as main.</p>
            {#if sizeHistorySeries.length === 0}<div class="empty-state inline-empty"><p class="muted">Repository-size history is NOT MEASURED for this snapshot.</p></div>{/if}
            <div class="size-series-grid">{#each sizeHistorySeries as series}<article class="panel size-series"><div class="size-series-heading"><div><p class="eyebrow">{series.ref}</p><h4>{series.label}</h4><p class="tuple">head {series.head_commit} · {series.points.length} commits</p></div>{#if series.points.length > 0}<strong>{formatBytes(series.points.at(-1)!.bytes)}</strong>{/if}</div>{#if series.points.length > 0}<svg class="size-chart" viewBox="0 0 100 38" role="img" aria-labelledby={`size-title-${series.series_id}`} preserveAspectRatio="none"><title id={`size-title-${series.series_id}`}>{series.label} tracked bytes across {series.points.length} commits</title><line x1="0" x2="100" y1="34" y2="34"></line><polyline points={sizePolyline(series.points)}></polyline></svg><div class="size-summary"><span>{formatBytes(series.points[0]!.bytes)} first</span><span>{formatBytes(series.points.at(-1)!.bytes - series.points[0]!.bytes)} net change</span><span>{series.points.at(-1)!.files.toLocaleString()} files at head</span></div>{/if}<details class="disclosure"><summary>All commit measurements · {series.points.length}</summary>{#if series.points.length === 0}<p class="muted">No points recorded.</p>{:else}<div class="commit-history-list">{#each series.points as point}<div><span class="tuple">{point.observed_at} · {point.commit}</span><strong>{point.files.toLocaleString()} files · {formatBytes(point.bytes)} · {point.delta_bytes >= 0 ? "+" : ""}{formatBytes(point.delta_bytes)}</strong></div>{/each}</div>{/if}<p class="muted">Evidence: {series.evidence.map((item) => item.path).join(", ") || "INSUFFICIENT EVIDENCE"}.</p></details></article>{/each}</div>
          </section>
        {:else if activeView === "Issues / Remediation"}
          <p class="eyebrow">Issue graph · {snapshot.issues.length} roots</p>
          <h2 class="view-heading">Remediation workbench</h2>
          <p class="view-lead">Selection is explicit. Prerequisites are added visibly; planner order, presentation sort, and filters remain separate. No planned issue is counted as paid.</p>
          <div class="control-stack">
            <div class="filter-grid primary-filters" aria-label="Issue planning controls">
              <label><span class="label">Search</span><input class="input" bind:value={issueQuery} placeholder="Search issues" /></label>
              <label><span class="label">DAG objective</span><select class="control" bind:value={objective}>{#each objectives as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
              <label><span class="label">Sort</span><select class="control" bind:value={workbenchSort}>{#each workbenchSorts as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
            </div>
            <details class="panel disclosure more-filters">
              <summary>More filters</summary>
              <div class="filter-grid" aria-label="Additional issue filters">
                <label><span class="label">Domain</span><select class="control" bind:value={issueDomain}><option value="">All domains</option>{#each issueDomains as value}<option value={value}>{value}</option>{/each}</select></label>
                <label><span class="label">Owner</span><select class="control" bind:value={issueOwner}><option value="">All owners</option>{#each issueOwners as value}<option value={value}>{value}</option>{/each}</select></label>
                <label><span class="label">State</span><select class="control" bind:value={issueState}><option value="">All states</option>{#each issueStates as value}<option value={value}>{humanState(value)}</option>{/each}</select></label>
              </div>
            </details>
          </div>
          <p class="section-caption">Showing {workbenchIssues.length} of {plannedIssues.length}. Planner order remains the execution order even when the table is presented by another field.</p>
          {#if plannedIssues.length === 0}<section class="empty-state inline-empty"><h3 class="section-title">No issue roots are recorded</h3><p class="muted">Issue inventory is empty for this exact snapshot. That fact does not establish CLEAN; use the terminal contract on Progress.</p></section>{/if}
          <div class="table-wrap"><table class="table issue-table"><caption class="sr-only">Dependency-aware remediation issues</caption><thead><tr><th scope="col">Plan</th><th scope="col">Issue</th><th scope="col">Priority</th><th scope="col">Coordination</th><th scope="col">Recommended route</th></tr></thead><tbody>
            {#each workbenchIssues as issue}
              {@const routing = issueRouting(issue)}
              {@const issueBestValue = bestValueAgent(routing.ranked.map((item) => item.agent))}
              <tr>
                <td data-label="Plan"><div class="plan-cell"><label class="check-target"><input type="checkbox" checked={selectedClosure.includes(issue.issue_id)} onchange={() => toggleIssue(issue)} /><span class="sr-only">Select {issue.issue_id}</span></label><div class="data"><strong>{issue.plan.order || "Blocked"}</strong><span>{humanState(issue.state)}</span></div></div></td>
                <td data-label="Issue"><button class="link-button issue-link" aria-expanded={detailsIssueId === issue.issue_id} onclick={() => (detailsIssueId = detailsIssueId === issue.issue_id ? null : issue.issue_id)}><strong>{issue.issue_id}</strong><span>{issue.title}</span></button><p class="row-meta">{issue.debt_domain} · {issue.owner} · first {issue.first_detected_run_id} · {percent(issue.confidence)} confidence</p>{#if detailsIssueId === issue.issue_id}<div class="issue-detail"><p>{issue.description}</p><p><strong>Origin and provenance:</strong> {humanState(issue.origin)} · {issue.evidence.map((ref) => ref.path).join(", ") || "INSUFFICIENT EVIDENCE"} · first {issueAge(issue)}</p><p><strong>Blast radius:</strong> {issue.affected_paths.length} paths · {issue.affected_invariants.length} invariants · regression risk {issue.regression_risk}. {issue.affected_paths.join(", ")}</p><p><strong>Verification requirements:</strong> {issue.acceptance_boundary.join("; ") || "NOT RECORDED"}</p><p><strong>Owner / worktree:</strong> {issue.owner} · {issue.worktree ?? "none declared"}</p><p><strong>Coordination domains:</strong> {issue.coordination_claims.map((claim) => `${claim.key} (${claim.access}; ${claim.operation_class})`).join("; ") || "none declared"}</p><p><strong>Dependencies:</strong> prerequisites {issue.prerequisite_issue_ids.join(", ") || "none"} · dependents {issue.dependent_issue_ids.join(", ") || "none"}</p><p><strong>Optimal tuple:</strong> {formatAgentTuple(routing.ranked[0]?.agent)}<br /><strong>Runner-up:</strong> {formatAgentTuple(routing.ranked[1]?.agent)}<br /><strong>Best active:</strong> {formatAgentTuple(routing.ranked.find((item) => item.agent.active_in_repository)?.agent)}<br /><strong>Best value:</strong> {formatAgentTuple(issueBestValue ?? undefined)}</p><p><strong>Directive state:</strong> {snapshot.manifest ? `${humanState(snapshot.manifest.directive_state)} · ${snapshot.manifest.directive_id}` : "Unbound ADVISE preview; no delivery or execution claim"}</p></div>{/if}</td>
                <td data-label="Priority" class="data"><strong>S{issue.severity} · D{issue.remediation_difficulty}</strong><span>unlock {issue.unlock_value} · risk {issue.regression_risk}</span></td>
                <td data-label="Coordination"><span class:status-pass={issue.plan.concurrency === "Parallelizable"} class:status-caution={issue.plan.concurrency === "Ordered"} class:status-risk={issue.plan.concurrency === "Blocked"}>{issue.plan.concurrency}</span><p class="row-meta">{issue.plan.classification_reason.join("; ")}</p></td>
                <td data-label="Recommended route"><strong>{formatAgentTuple(routing.ranked[0]?.agent)}</strong><span class="row-meta">{routing.ranked[0]?.agent.active_in_repository ? "active in repository" : "best supported available"}</span></td>
              </tr>
            {/each}
          </tbody></table></div>
          <section class="section"><h3 class="section-title">Generated directive</h3><p class="section-caption">{selectedClosure.length} selected with dependency closure. {snapshot.manifest ? "Manifest-bound projection." : "Unbound ADVISE preview."}</p><pre class="directive" aria-label="Generated remediation directive">{directiveText}</pre><div class="toolbar"><button class="control active" onclick={copyDirective}>Copy directive</button>{#if copyMessage}<span class="notice" role="status">{copyMessage}</span>{/if}</div></section>
        {:else if activeView === "Agent Finder"}
          <p class="eyebrow">Evidence-qualified routing · {CAPABILITY_DEFINITIONS.length} repository capabilities</p>
          <h2 class="view-heading">Find the best agent for…</h2>
          <p class="view-lead">Each press cycles a capability weight 1 → 2 → 3 → off. Rankings use score × confidence × weight for exact model + harness + reasoning treatments. Historical qualification is not a current route binding.</p>
          <div class="toolbar finder-toolbar"><input class="input" bind:value={query} onkeydown={capabilityQueryKeydown} placeholder="Capability to match" aria-label="Find the best agent for a capability" list="capability-options" /><button type="button" class="control active" onclick={addCapabilityFromQuery}>Add capability</button><datalist id="capability-options">{#each CAPABILITY_DEFINITIONS as definition}<option value={definition.label}></option>{/each}</datalist><details class="capability-picker"><summary>Capability weights · {selections.length} selected</summary><div class="capability-grid">{#each CAPABILITY_DEFINITIONS as definition}<button class:active={(capabilityWeights[definition.id] ?? 0) > 0} class="weight" onclick={() => cycleCapability(definition.id)} aria-label={`Weight ${definition.label}: ${capabilityWeights[definition.id] ?? 0}`} aria-pressed={(capabilityWeights[definition.id] ?? 0) > 0}>{definition.label} · {capabilityWeights[definition.id] ?? 0}</button>{/each}</div></details></div>
          {#if capabilityMessage}<p class="notice" role="status">{capabilityMessage}</p>{/if}
          <div class="ranking-summary" aria-label="Routing decision summary"><p><strong>Optimal:</strong> {formatAgentTuple(ranked.ranked[0]?.agent)}</p><p><strong>Runner-up:</strong> {formatAgentTuple(ranked.ranked[1]?.agent)}</p><p><strong>Best active:</strong> {formatAgentTuple(ranked.ranked.find((item) => item.agent.active_in_repository)?.agent)}</p><p><strong>Best value:</strong> {formatAgentTuple(bestValue ?? undefined)}{#if !bestValue} · cost per success unavailable{/if}</p></div>
          {#if selections.length === 0}<section class="empty-state"><h3 class="section-title">Choose at least one capability</h3><p class="muted">No universal score is inferred. Select the work that matters to create a routing decision.</p></section>{/if}
          <div class="agent-grid">{#each ranked.ranked as item}<article class="agent-card"><span class="status-pass">Ranked · {item.weighted_score.toFixed(3)}</span><h3>{item.agent.model}</h3><p class="tuple">{formatAgentTuple(item.agent)}</p><p class="muted">{item.agent.inference_source} · {item.agent.route}</p><p><strong>Primary qualification:</strong> {qualificationLabel(primaryQualification(item.agent, selections.map((selection) => selection.capability_id)))}</p><p>{humanState(item.agent.availability)} · {item.agent.active_in_repository ? "active in repository" : "global candidate"} · {item.agent.familiarity_runs} familiarity runs</p>{#each item.category_scores as score}{@const evidenceScore = selectedScore(item.agent, score.capability_id)}<div class="capability-evidence"><div class="capability-line"><span>{ALL_CAPABILITY_DEFINITIONS.find((definition) => definition.id === score.capability_id)?.label ?? score.capability_id}</span><strong>{score.weighted_score.toFixed(3)}</strong></div><p class="muted">Score {evidenceScore?.score.toFixed(3) ?? "N/A"} · confidence {evidenceScore ? percent(evidenceScore.confidence) : "N/A"} · weight {capabilityWeights[score.capability_id] ?? 0} · {evidenceScore?.verified_trials ?? 0} credited trials · {qualificationLabel(evidenceScore?.qualification ?? "UNTESTED")}</p>{#if evidenceScore}<p class="muted">Verified {evidenceScore.qualification_provenance.verified_successes}/{evidenceScore.verified_trials} · {evidenceScore.qualification_provenance.repository_cohort_count} repositories · independent {evidenceScore.qualification_provenance.independent_evaluation ? "yes" : "no"} · unresolved no-harm {evidenceScore.qualification_provenance.unresolved_no_harm_violations} · authority {evidenceScore.qualification_provenance.unresolved_authority_violations}</p>{/if}</div>{/each}<details class="disclosure agent-card-detail"><summary>Agent card · execution profile</summary><p class="muted"><strong>Harness:</strong> {item.agent.harness}; version NOT RECORDED. <strong>Model:</strong> {item.agent.model}; model version and release date NOT RECORDED. <strong>Reasoning:</strong> {item.agent.reasoning_level}; temperature and sampling settings NOT RECORDED.</p><p class="muted"><strong>Inference:</strong> {item.agent.inference_source} · deployment {item.agent.deployment} · gateway/server details NOT RECORDED. <strong>Invocation:</strong> {item.agent.invocation_adapter} · headless {item.agent.headless === null ? "UNKNOWN" : item.agent.headless ? "PROVEN" : "NO"}.</p><p class="muted"><strong>Capability environment:</strong> tool, plugin, MCP, and skill inventories NOT RECORDED in snapshot {CONTROL_PLANE_SNAPSHOT_SCHEMA_VERSION}. <strong>Context:</strong> starting context and context window NOT MEASURED.</p><p class="muted"><strong>Current identity:</strong> {humanState(item.agent.execution_identity.disposition)} · intended surface {item.agent.execution_identity.intended_surface_label} · externally verified {item.agent.execution_identity.last_external_verification_at ?? "NOT VERIFIED"}. Evidence: {item.agent.execution_identity.evidence.map((ref) => ref.path).join(", ") || "INSUFFICIENT EVIDENCE"}.</p><p class="muted"><strong>Performance:</strong> cost/success {numberMetric(item.agent.metrics.cost_per_success_usd, " USD")} · tokens/success {numberMetric(item.agent.metrics.tokens_per_success)} · throughput {numberMetric(item.agent.metrics.tokens_per_second, " tok/s")} · reliability {percent(item.agent.metrics.reliability)} · TTFT NOT MEASURED.</p></details></article>{/each}</div>{#if ranked.excluded.length > 0}<details class="panel disclosure"><summary>Excluded candidates · {ranked.excluded.length}</summary><ul class="list">{#each ranked.excluded as item}<li><span>{formatAgentTuple(item.agent)}</span><strong>{item.reason}</strong></li>{/each}</ul></details>{/if}
        {:else if activeView === "Team Roster"}
          <p class="eyebrow">Repository and machine-global roster · grouped by family + harness</p><h2 class="view-heading">Seats, readiness, and evidence</h2><p class="view-lead">Active repository groups appear first. Expand a group to inspect every exact model + harness + reasoning treatment. Untested is not failed, and a historical qualification is not current route proof.</p>
          {#if rosterGroups.length === 0}<section class="empty-state inline-empty"><h3 class="section-title">No agent tuples are recorded</h3><p class="muted">The repository can still be inspected, but routing recommendations remain unavailable until externally verified execution profiles exist.</p></section>{/if}
          <div class="roster-groups">{#each rosterGroups as group}<details class="panel roster-group" open={group.active_count > 0}><summary><span><strong>{group.family} · {group.harness}</strong><small>{group.treatments.length} exact treatments</small></span><span>{group.active_count} active · {group.available_count} available</span></summary><div class="roster-treatment-grid">{#each group.treatments as agent}<article class="roster-treatment"><div><strong>{agent.model}</strong><p class="tuple">{agent.reasoning_level} · {agent.agent_tuple_id}</p></div><dl><div><dt>Role / surface</dt><dd>{agent.role}<br /><span class="muted">{agent.control_surface ?? "NOT CONFIGURED"}</span></dd></div><div><dt>Qualification</dt><dd>{qualificationLabel(primaryQualification(agent, []))}<br /><span class="muted">{Math.max(...agent.capability_scores.map((score) => score.verified_trials), 0)} max credited trials</span></dd></div><div><dt>Availability</dt><dd>{humanState(agent.availability)}<br /><span class="muted">{agent.active_in_repository ? "active in repository" : "machine-global candidate"}</span></dd></div><div><dt>Route / inference</dt><dd>{agent.route}<br /><span class="muted">{agent.inference_source}</span></dd></div></dl><details class="disclosure agent-card-detail"><summary>Agent card · {humanState(agent.execution_identity.disposition)}</summary><p class="muted">Harness {agent.harness}; version NOT RECORDED. Model {agent.model}; version and release date NOT RECORDED. Reasoning {agent.reasoning_level}; sampling settings NOT RECORDED.</p><p class="muted">Deployment {agent.deployment}; inference {agent.inference_source}; adapter {agent.invocation_adapter}; gateway/server and capability environment NOT RECORDED. Intended surface {agent.execution_identity.intended_surface_label}; externally verified {agent.execution_identity.last_external_verification_at ?? "NOT VERIFIED"}. Evidence: {agent.execution_identity.evidence.map((ref) => ref.path).join(", ") || "INSUFFICIENT EVIDENCE"}.</p></details></article>{/each}</div></details>{/each}</div>
          <section class="section"><h3 class="section-title">Qualification policy</h3><div class="metric-grid"><div class="metric"><strong>10</strong><span>Recommended supervised</span></div><div class="metric"><strong>25</strong><span>Qualified · 2 repos · 90%</span></div><div class="metric"><strong>50</strong><span>Production-cleared · 3 repos · 95%</span></div><div class="metric"><strong>5%</strong><span>Post-clear sample floor</span></div></div><p class="section-caption">Every Mister Clean run is evaluated until 50 credited trials. After production clearance, every twentieth Mister Clean run is sampled; failures remain visible.</p></section>
        {:else if activeView === "Raw Agent Inventory"}
          <p class="eyebrow">Machine-global inventory · exact tuples</p><h2 class="view-heading">All observed agent tuples</h2><p class="view-lead">Every model + harness + reasoning level + execution route remains a separate treatment. Self-reported labels do not establish execution identity. Unavailable measures remain NOT MEASURED rather than being estimated.</p>
          <div class="filter-grid primary-filters inventory-primary" aria-label="Inventory primary controls"><label><span class="label">Search</span><input class="input" bind:value={inventoryQuery} placeholder="Search agents" /></label><label><span class="label">Sort</span><select class="control" bind:value={inventorySort}>{#each inventorySorts as option}<option value={option.id}>{option.label}</option>{/each}</select></label></div>
          <details class="panel disclosure more-filters">
            <summary>More filters</summary>
            <div class="filter-grid inventory-filters" aria-label="Additional inventory filters"><label><span class="label">Harness</span><select class="control" bind:value={inventoryHarness}><option value="">All harnesses</option>{#each inventoryHarnesses as value}<option value={value}>{value}</option>{/each}</select></label><label><span class="label">Availability</span><select class="control" bind:value={inventoryAvailability}><option value="">All states</option>{#each inventoryAvailabilities as value}<option value={value}>{humanState(value)}</option>{/each}</select></label><label><span class="label">Capability</span><select class="control" bind:value={inventoryCapability}><option value="">Best supported</option>{#each CAPABILITY_DEFINITIONS as definition}<option value={definition.id}>{definition.label}</option>{/each}</select></label></div>
          </details>
          <div class="inventory-page-row"><p class="section-caption">Showing {allSortedAgents.length === 0 ? 0 : (inventoryPage - 1) * inventoryPageSize + 1}–{Math.min(inventoryPage * inventoryPageSize, allSortedAgents.length)} of {allSortedAgents.length} matching treatments · {snapshot.agents.length} total.</p><div class="toolbar" aria-label="Inventory pages"><button class="control" disabled={inventoryPage === 1} onclick={() => (inventoryPage = Math.max(1, inventoryPage - 1))}>Previous</button><span class="label">Page {inventoryPage} of {inventoryPageCount}</span><button class="control" disabled={inventoryPage === inventoryPageCount} onclick={() => (inventoryPage = Math.min(inventoryPageCount, inventoryPage + 1))}>Next</button></div></div>
          {#if snapshot.agents.length === 0}<section class="empty-state inline-empty"><h3 class="section-title">No machine-local roster has been imported</h3><p class="muted">Model, harness, reasoning, inference, and capability evidence are all NOT MEASURED.</p></section>{/if}
          <div class="table-wrap"><table class="table inventory-table"><caption class="sr-only">Filterable machine-global exact agent tuple inventory</caption><thead><tr><th scope="col">Agent tuple</th><th scope="col">Capability evidence</th><th scope="col">Performance</th><th scope="col">Execution route</th><th scope="col">State</th></tr></thead><tbody>{#each sortedAgents as agent}{@const inventoryScore = preferredCapabilityScore(agent, inventoryCapability)}<tr><td data-label="Agent tuple"><strong>{agent.model}</strong><p class="row-meta">{agent.harness} · {agent.reasoning_level}</p><span class="tuple">{agent.agent_tuple_id}</span><details class="disclosure agent-card-detail"><summary>Open agent card</summary><p class="muted">Portable execution profile: harness version, model version/release date, full settings, gateway/server, capability environment, and context footprint are NOT RECORDED unless shown elsewhere in this row. Secret values are never displayed.</p></details></td><td data-label="Capability evidence">{inventoryScore && inventoryScore.verified_trials > 0 ? ALL_CAPABILITY_DEFINITIONS.find((definition) => definition.id === inventoryScore.capability_id)?.label ?? inventoryScore.capability_id : "UNQUALIFIED — NO CREDITED EVIDENCE"}<p class="row-meta">{inventoryScore && inventoryScore.verified_trials > 0 ? `score ${inventoryScore.score.toFixed(3)} · confidence ${percent(inventoryScore.confidence)} · ${inventoryScore.verified_trials} trials · ${qualificationLabel(inventoryScore.qualification)}` : "Historical or imported hypotheses receive no current score credit."}</p></td><td data-label="Performance" class="data"><strong>{percent(agent.metrics.verified_success_rate)}</strong><span>success · {percent(agent.metrics.reliability)} reliability</span><span>{numberMetric(agent.metrics.cost_per_success_usd, " USD/success")}</span><span>{numberMetric(agent.metrics.tokens_per_success, " tokens/success")} · {numberMetric(agent.metrics.tokens_per_second, " tok/s")}</span></td><td data-label="Execution route"><strong>{agent.inference_source}</strong><p class="row-meta">{humanState(agent.deployment)} · {agent.route} · {agent.invocation_adapter}</p><p class="row-meta">Headless {agent.headless === null ? "UNKNOWN" : agent.headless ? "PROVEN" : "NO"} · local {agent.metrics.local === null ? "UNKNOWN" : agent.metrics.local ? "YES" : "NO"}</p></td><td data-label="State"><strong>{humanState(agent.availability)}</strong><p class="row-meta">{agent.familiarity_runs} repository runs · {agent.active_in_repository ? "active" : "global"}</p><details class="disclosure"><summary>Identity · {humanState(agent.execution_identity.disposition)}</summary><p class="muted">Intended surface: {agent.execution_identity.intended_surface_label}. External verification: {agent.execution_identity.last_external_verification_at ?? "NOT VERIFIED"}. Evidence: {agent.execution_identity.evidence.map((ref) => ref.path).join(", ") || "INSUFFICIENT EVIDENCE"}.</p></details></td></tr>{/each}</tbody></table></div>
        {:else if activeView === "Run History"}
          <p class="eyebrow">Immutable observations · deterministic current-interpretation overlay</p>
          <h2 class="view-heading">What changed—and why</h2>
          <p class="view-lead">Observed then stays bound to its detector and repository object. Known now adds roots that evidence says already existed. Improved visibility never masquerades as repository regression.</p>
          <div class="toolbar" aria-label="History sort">{#each [{id:"observed_at",label:"Newest"},{id:"remaining",label:"Remaining"},{id:"caused",label:"Caused"}] as option}<button class:active={historySort === option.id} class="control" onclick={() => (historySort = option.id as typeof historySort)}>{option.label}</button>{/each}</div>
          {#if sortedRuns.length === 0}<section class="empty-state inline-empty"><h3 class="section-title">No run observations are recorded</h3><p class="muted">History, detector evolution, and directional claims are UNKNOWN.</p></section>{/if}
          <div class="run-timeline">
            {#each sortedRuns as run}
              {@const knownNow = knownNowIssueIds(snapshot, run)}
              <article class="run-card">
                <header class="run-card-header">
                  <div><p class="eyebrow">{run.observed_at}</p><h3>{run.run_id}</h3><p class="tuple">Mister Clean {run.mister_clean_version} · detector {run.detector_version}</p></div>
                  <div class="run-verdict"><span class:status-pass={run.terminal_verdict === "CLEAN"} class:status-risk={run.terminal_verdict !== "CLEAN"}>{humanState(run.start_verdict)} → {humanState(run.terminal_verdict)}</span><strong>{run.debt_flow.ending_real_issues}</strong><small>remaining</small></div>
                </header>
                <div class="run-flow" aria-label={`Debt flow for ${run.run_id}`}>
                  <span><strong>{run.debt_flow.starting_real_issues}</strong> starting</span>
                  <span><strong>+{run.debt_flow.discovered_preexisting}</strong> discovered</span>
                  <span><strong>+{run.debt_flow.caused_by_remediation}</strong> caused</span>
                  <span><strong>−{run.debt_flow.paid}</strong> paid</span>
                  <span><strong>{run.debt_flow.boundary_blocked}</strong> blocked</span>
                </div>
                <p>{run.note}</p>
                <details class="disclosure run-detail">
                  <summary>Evidence-bound run detail</summary>
                  <div class="run-detail-grid">
                    <section><h4>Observed then</h4><p>{run.real_issue_ids.length} bound roots · {run.false_positive_issue_ids.length} false positives.</p><p class="tuple">{run.real_issue_ids.join(", ") || "No retained root IDs"}</p></section>
                    <section><h4>Known now</h4><p>{knownNow.length} real roots under the current interpretation.</p><p class="tuple">{knownNow.join(", ") || "none"}</p></section>
                    <section><h4>Repository object</h4><p>{run.subject.branch} · {run.subject.commit} · {run.subject.tree}</p><p class="tuple">{run.subject.repository_object_sha256}</p><p><strong>Scope:</strong> {run.scope.join(", ") || "NOT RECORDED"}. <strong>Excluded:</strong> {run.exclusions.join(", ") || "none"}.</p></section>
                    <section><h4>Process and receipts</h4><p><strong>Misses:</strong> {run.detector_misses.join(", ") || "none"}. <strong>Defects:</strong> {run.process_defects.join(", ") || "none"}. <strong>Corrections:</strong> {run.classification_corrections.join(", ") || "none"}.</p><p><strong>Directives:</strong> {run.directives.join(", ") || "none"}. <strong>Receipts:</strong> {run.receipts.map((receipt) => receipt.path).join(", ") || "none"}.</p></section>
                  </div>
                  <p class="muted">{run.run_id === snapshot.current_run_id ? `Current topology: ${activeAgents.length} active agents · ${activeControlSurfaces} control surfaces · ${currentWorktrees} declared issue worktrees · ${unboundActiveAgents} unbound identities.` : `Historical topology is NOT RECORDED in snapshot ${CONTROL_PLANE_SNAPSHOT_SCHEMA_VERSION}; current team is not projected backward.`}</p>
                </details>
              </article>
            {/each}
          </div>
        {:else}
          <p class="eyebrow">Method, versions, and evidence boundaries</p><h2 class="view-heading">A local control plane, not a second authority</h2><p class="view-lead">The browser consumes a strict read model over repository-local evidence and machine-global routing records. SQLite, exact-object observations, manifests, and receipts remain authoritative. Missing evidence stays visible.</p>
          <div class="split"><section class="panel"><h3>Read path and versions</h3><ul class="list"><li><span>Source</span><strong>{snapshot.source_label}</strong></li><li><span>Repository object</span><strong>{snapshot.current_subject.repository_object_sha256}</strong></li><li><span>Mister Clean / detector</span><strong>{currentRun?.mister_clean_version ?? "UNKNOWN"} · {currentRun?.detector_version ?? "UNKNOWN"}</strong></li><li><span>Snapshot / taxonomy</span><strong>{CONTROL_PLANE_SNAPSHOT_SCHEMA_VERSION} · {snapshot.capabilities[0]?.taxonomy_version ?? "UNKNOWN"}</strong></li><li><span>Issue graph</span><strong>{snapshot.manifest ? `${snapshot.manifest.issue_graph.issue_graph_id} v${snapshot.manifest.issue_graph.version}` : "NOT AVAILABLE — no manifest"}</strong></li><li><span>Runtime identity</span><strong>NOT AVAILABLE in snapshot schema {CONTROL_PLANE_SNAPSHOT_SCHEMA_VERSION}</strong></li><li><span>Detector coverage</span><strong>{snapshot.detector_coverage}</strong></li><li><span>Evidence freshness</span><strong>{snapshot.evidence_freshness}</strong></li></ul></section><section class="panel"><h3>Authority and unavailable evidence</h3><ul class="list"><li><span>Authority</span><strong>{snapshot.current_authority}</strong></li><li><span>Directive</span><strong>{snapshot.manifest ? `${snapshot.manifest.directive_state} · ${snapshot.manifest.manifest_id}` : "unbound ADVISE preview"}</strong></li><li><span>Integration</span><strong>{snapshot.manifest?.receipt_boundary ?? "manifest + lease + target CAS required"}</strong></li><li><span>Historical topology</span><strong>NOT RECORDED; never inferred from current agents</strong></li><li><span>Performance metrics</span><strong>NOT MEASURED until ledger-derived projection exists</strong></li><li><span>Secrets</span><strong>References only; never in snapshot/UI</strong></li></ul></section></div>
          <section class="section"><h3 class="section-title">Debt accounting rules</h3><div class="split"><div class="panel"><h3>Dual ledger</h3><p>Ending real issues = starting + discovered pre-existing + caused by remediation + concurrent external − paid − invalidated false positives + classification correction delta.</p><p class="muted">Discovered pre-existing debt expands known scope; it does not mean the repository became dirtier. Caused-by-remediation debt is the no-harm regression signal. False positives remain in detailed history but leave the real-issue headline.</p></div><div class="panel"><h3>Terminal rule</h3><p>CLEAN requires zero payable, caused, and boundary-blocked debt plus every independently evidenced terminal-contract clause on the exact current subject.</p><p class="muted">A zero count, green validator, planned wave, copied prompt, or transport acknowledgement cannot establish CLEAN, delivery, execution, or acceptance.</p></div></div></section>
          <section class="section"><h3 class="section-title">Qualification and telemetry</h3><div class="split"><div class="panel"><h3>Qualification policy</h3><ul class="list"><li><span>Recommended · supervised</span><strong>10 verified trials</strong></li><li><span>Qualified</span><strong>25 trials · 2 repos · ≥90%</strong></li><li><span>Production-cleared</span><strong>50 trials · 3 repos · ≥95% · independent · zero unresolved harm/authority violations</strong></li><li><span>Ongoing sampling</span><strong>Every 20th Mister Clean run · 5%</strong></li></ul></div><div class="panel"><h3>Local / global synchronization</h3><ol><li>Import relevant machine-global tuple evidence at invocation.</li><li>Bind repository runs, issues, assignments, and receipts locally.</li><li>Return bounded provenance-backed trial telemetry to the machine-global store.</li><li>Keep cross-machine reconciliation operator-owned; no cloud sync is inferred.</li></ol></div></div></section>
          <section class="section"><h3 class="section-title">Complexity measurement limits</h3><p class="section-caption">Availability {availabilityLabel(snapshot.complexity.availability)}; object {snapshot.complexity.object_sha256 ?? "UNKNOWN"}. Thresholds are repository policy, not universal truth.</p><div class="panel"><p>{snapshot.complexity.structural_coverage}</p><ul>{#each snapshot.complexity.limitations as limitation}<li>{limitation}</li>{/each}</ul><p class="muted">Function and cyclomatic measures do not prove conceptual simplicity. Generated, test, documentation, and ignored evidence classifications depend on explicit repository policy.</p></div></section>
          <section class="section"><h3 class="section-title">Capability taxonomy</h3><p class="section-caption">{CAPABILITY_DEFINITIONS.length} repository-remediation capabilities plus one separate protocol meta-capability. Taxonomy version {snapshot.capabilities[0]?.taxonomy_version ?? "UNKNOWN"}.</p><div class="taxonomy-grid">{#each ALL_CAPABILITY_DEFINITIONS as definition}<details class="taxonomy-item"><summary>{definition.label}</summary><p>{definition.description}</p><span class="tuple">{definition.scope} · {definition.family} · {definition.id}</span></details>{/each}</div></section>
        {/if}
      {/if}
    </main>
  </div>
</div>
