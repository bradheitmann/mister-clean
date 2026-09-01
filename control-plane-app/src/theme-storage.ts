import { initializeTheme, type OkoaTheme, type ThemeHost } from "./theme.js";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;
const unavailable: ThemeStorage = { getItem: () => null, setItem: () => undefined };
let storage: ThemeStorage = unavailable;

export function bootstrapTheme(
  windowLike: Pick<Window, "localStorage"> = window,
  target: ThemeHost = document.documentElement,
  possibleHosts: readonly ThemeHost[] = [target],
): OkoaTheme {
  try { storage = windowLike.localStorage; } catch { storage = unavailable; }
  return initializeTheme(storage, target, possibleHosts);
}

export function themeStorage(): ThemeStorage { return storage; }
