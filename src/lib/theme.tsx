"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { SYSTEM_THEME_QUERY, THEME_STORAGE_KEY, type Theme } from "./theme-config";

export type { Theme } from "./theme-config";

const DEFAULT_THEME: Theme = "dark";
const CHANGE_EVENT = "pulsemetry:themechange";
let selectedTheme: Theme | null | undefined;

function readSavedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * 테마의 진실은 React state 가 아니라 html[data-theme] 입니다 —
 * 부트스트랩 스크립트가 React 보다 먼저 값을 정하기 때문입니다.
 * 그래서 state 를 복제하지 않고 DOM 을 외부 저장소로 구독합니다.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function getSnapshot(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : DEFAULT_THEME;
}

const getServerSnapshot = (): Theme => DEFAULT_THEME;

/** 직접 선택하기 전까지 시스템 테마 변경을 반영합니다. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const systemTheme = window.matchMedia(SYSTEM_THEME_QUERY);
    if (selectedTheme === undefined) selectedTheme = readSavedTheme();

    const syncTheme = () => {
      applyTheme(selectedTheme ?? (systemTheme.matches ? "dark" : "light"));
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      selectedTheme = readSavedTheme();
      syncTheme();
    };

    systemTheme.addEventListener("change", syncTheme);
    window.addEventListener("storage", syncStorage);
    syncTheme();
    return () => {
      systemTheme.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  return <>{children}</>;
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setTheme = useCallback((next: Theme) => {
    selectedTheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 프라이빗 모드 등 — 저장 실패는 무시합니다 */
    }
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, isDark: theme === "dark", setTheme, toggleTheme };
}
