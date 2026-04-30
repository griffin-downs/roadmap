// useTheme — dark/light theme toggle composable.
//
// Three-way state: "dark" · "light" · "system" (matches OS via
// prefers-color-scheme media query). Persisted to localStorage under
// `viewer.theme`. Sets `data-theme="dark|light"` on <html> so CSS
// variables resolve at the root level. Pure logic; no Vue templates.
//
// Caller drives lifecycle by reading `theme` (resolved · dark|light) and
// calling `setMode(mode)` from a toggle. The composable installs a single
// media-query listener while in "system" mode and tears it down otherwise.
//
// Guards first. One concern: theme mode resolution + DOM root var-flip.

import { ref, computed, watch, onUnmounted } from "vue";
import type { Ref, ComputedRef } from "vue";

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "viewer.theme";
const ROOT_ATTR = "data-theme";

export interface ThemeHandle {
  /** user's selection — may be "system" */
  mode: Ref<ThemeMode>;
  /** resolved theme actually applied to the DOM (never "system") */
  theme: ComputedRef<ResolvedTheme>;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

export function useTheme(): ThemeHandle {
  const mode = ref<ThemeMode>(loadMode());
  const systemPrefersDark = ref<boolean>(detectSystemDark());
  const mql = bindSystemListener((dark) => {
    systemPrefersDark.value = dark;
  });

  const theme = computed<ResolvedTheme>(() => {
    if (mode.value === "system") return systemPrefersDark.value ? "dark" : "light";
    return mode.value;
  });

  watch(
    theme,
    (resolved) => applyToRoot(resolved),
    { immediate: true },
  );

  function setMode(next: ThemeMode): void {
    mode.value = next;
    persistMode(next);
  }

  function cycle(): void {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const i = order.indexOf(mode.value);
    setMode(order[(i + 1) % order.length]);
  }

  onUnmounted(() => {
    if (mql) mql.removeEventListener("change", onMediaChange);
  });

  function onMediaChange(ev: MediaQueryListEvent): void {
    systemPrefersDark.value = ev.matches;
  }

  return { mode, theme, setMode, cycle };
}

function loadMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "dark" || raw === "light" || raw === "system") return raw;
  return "system";
}

function persistMode(mode: ThemeMode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

function detectSystemDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function bindSystemListener(
  cb: (dark: boolean) => void,
): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", (ev) => cb(ev.matches));
  return mql;
}

function applyToRoot(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(ROOT_ATTR, theme);
}

export const _internals = { loadMode, persistMode, detectSystemDark, applyToRoot };
