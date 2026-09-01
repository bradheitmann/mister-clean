export interface OkoaThemeOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly mode: "light" | "dark";
  readonly group: "operator" | "developer";
}

export const OKOA_THEMES = [
  { id: "voltage", label: "Voltage · Dark", family: "Voltage", mode: "dark", group: "operator" },
  { id: "voltage-light", label: "Voltage · Light", family: "Voltage", mode: "light", group: "operator" },
  { id: "stillness", label: "Stillness · Light", family: "Stillness", mode: "light", group: "operator" },
  { id: "stillness-dark", label: "Stillness · Dark", family: "Stillness", mode: "dark", group: "operator" },
  { id: "shibuya-light", label: "Shibuya · Light", family: "Urban Japan", mode: "light", group: "operator" },
  { id: "art-of-zen-dark", label: "Art of Zen · Dark", family: "Urban Japan", mode: "dark", group: "operator" },
  { id: "art-of-zen", label: "Art of Zen · Light", family: "Japandi", mode: "light", group: "operator" },
  { id: "japandi-dark", label: "Japandi · Dark", family: "Japandi", mode: "dark", group: "operator" },
  { id: "japandi-warm", label: "Japandi Warm · Light", family: "Japandi Warm", mode: "light", group: "operator" },
  { id: "japandi-warm-dark", label: "Japandi Warm · Dark", family: "Japandi Warm", mode: "dark", group: "operator" },
] as const satisfies readonly OkoaThemeOption[];

export type OkoaTheme = (typeof OKOA_THEMES)[number]["id"];
export type ThemeHost = Pick<HTMLElement, "dataset">;
export const DEFAULT_THEME: OkoaTheme = "voltage";
export const THEME_STORAGE_KEY = "mister-clean.okoa-theme";

export const SEMANTIC_SIGNAL_ROLES = ["pass", "risk", "caution", "info"] as const;

export function isOkoaTheme(value: string | null | undefined): value is OkoaTheme {
  return OKOA_THEMES.some((theme) => theme.id === value);
}

export function parsePersistedTheme(value: string | null | undefined): OkoaTheme {
  return isOkoaTheme(value) ? value : DEFAULT_THEME;
}

export function readPersistedTheme(storage: Pick<Storage, "getItem">): OkoaTheme {
  try {
    return parsePersistedTheme(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistTheme(storage: Pick<Storage, "setItem">, theme: OkoaTheme): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing and blocked storage remain valid, non-persistent modes.
  }
}

export function applyTheme(theme: OkoaTheme, target: ThemeHost, possibleHosts: readonly ThemeHost[] = [target]): void {
  for (const host of new Set([...possibleHosts, target])) delete host.dataset.style;
  target.dataset.style = theme;
}

export function initializeTheme(
  storage: Pick<Storage, "getItem">,
  target: ThemeHost,
  possibleHosts: readonly ThemeHost[] = [target],
): OkoaTheme {
  const theme = readPersistedTheme(storage);
  applyTheme(theme, target, possibleHosts);
  return theme;
}
