import { describe, expect, it } from "vitest";
import { applyTheme, DEFAULT_THEME, initializeTheme, OKOA_THEMES, parsePersistedTheme, persistTheme, readPersistedTheme, SEMANTIC_SIGNAL_ROLES, THEME_STORAGE_KEY, type OkoaTheme, type ThemeHost } from "./theme.js";
import { bootstrapTheme } from "./theme-storage.js";

function memoryStorage(initial: string | null = null): Pick<Storage, "getItem" | "setItem"> {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
  };
}

describe("OKOA theme boundary", () => {
  it("defaults to canonical Voltage and falls back from invalid persistence", () => {
    expect(DEFAULT_THEME).toBe("voltage");
    expect(parsePersistedTheme("not-an-okoa-theme")).toBe(DEFAULT_THEME);
    expect(readPersistedTheme(memoryStorage("unknown"))).toBe(DEFAULT_THEME);
    const dataset: DOMStringMap = {};
    expect(initializeTheme(memoryStorage("unknown"), { dataset })).toBe(DEFAULT_THEME);
    expect(dataset.style).toBe(DEFAULT_THEME);
  });

  it("accepts every canonical operator theme", () => {
    const themes: OkoaTheme[] = ["voltage", "voltage-light", "stillness", "stillness-dark", "shibuya-light", "art-of-zen-dark", "art-of-zen", "japandi-dark", "japandi-warm", "japandi-warm-dark"];
    expect(OKOA_THEMES.map((theme) => theme.id)).toEqual(themes);
    for (const theme of themes) expect(parsePersistedTheme(theme)).toBe(theme);
    for (const family of new Set(OKOA_THEMES.map((theme) => theme.family))) {
      expect(new Set(OKOA_THEMES.filter((theme) => theme.family === family).map((theme) => theme.mode))).toEqual(new Set(["light", "dark"]));
    }
  });

  it("persists a selected theme and applies only the theme attribute", () => {
    const storage = memoryStorage();
    persistTheme(storage, "japandi-warm-dark");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("japandi-warm-dark");
    const dataset: DOMStringMap = {};
    applyTheme("japandi-warm-dark", { dataset });
    expect(dataset.style).toBe("japandi-warm-dark");
    expect(SEMANTIC_SIGNAL_ROLES).toEqual(["pass", "risk", "caution", "info"]);
  });

  it("normalizes values and hosts across live, initialized, bootstrapped, and system transitions", () => {
    type Path = (value: string, target: ThemeHost, hosts: readonly ThemeHost[]) => OkoaTheme;
    const live: Path = (value, target, hosts) => {
      const theme = parsePersistedTheme(value);
      applyTheme(theme, target, hosts);
      return theme;
    };
    const initialized: Path = (value, target, hosts) => initializeTheme(memoryStorage(value), target, hosts);
    const bootstrapped: Path = (value, target, hosts) => bootstrapTheme(
      { localStorage: memoryStorage(value) as Storage } as Pick<Window, "localStorage">,
      target,
      hosts,
    );
    const steps = [
      { value: "japandi-dark", target: 0 },
      { value: "voltage-light", target: 1 },
      { value: "invalid", target: 0 },
      { value: "japandi-warm-dark", target: 1 },
      { value: "shibuya-light", target: 0 },
    ] as const;
    const trace = (paths: readonly Path[]) => {
      const hosts = [{ dataset: {} as DOMStringMap }, { dataset: {} as DOMStringMap }] as const;
      return steps.map((step, index) => ({
        theme: paths[index % paths.length]!(step.value, hosts[step.target], hosts),
        fallback: { ...hosts[0].dataset },
        body: { ...hosts[1].dataset },
      }));
    };
    const expected = [
      { theme: "japandi-dark", fallback: { style: "japandi-dark" }, body: {} },
      { theme: "voltage-light", fallback: {}, body: { style: "voltage-light" } },
      { theme: DEFAULT_THEME, fallback: { style: DEFAULT_THEME }, body: {} },
      { theme: "japandi-warm-dark", fallback: {}, body: { style: "japandi-warm-dark" } },
      { theme: "shibuya-light", fallback: { style: "shibuya-light" }, body: {} },
    ];
    expect(trace([live])).toEqual(expected);
    expect(trace([initialized])).toEqual(expected);
    expect(trace([bootstrapped])).toEqual(expected);
    expect(trace([live, bootstrapped, initialized])).toEqual(expected);

    const hosts = [{ dataset: {} as DOMStringMap }, { dataset: {} as DOMStringMap }] as const;
    live("voltage-light", hosts[0], hosts);
    const unavailable = { get localStorage(): Storage { throw new Error("blocked"); } } as Pick<Window, "localStorage">;
    expect(bootstrapTheme(unavailable, hosts[1], hosts)).toBe(DEFAULT_THEME);
    expect(hosts.map(({ dataset }) => ({ ...dataset }))).toEqual([{}, { style: DEFAULT_THEME }]);
    initialized("voltage-light", hosts[0], hosts);
    expect(hosts.map(({ dataset }) => ({ ...dataset }))).toEqual([{ style: "voltage-light" }, {}]);
  });
});
