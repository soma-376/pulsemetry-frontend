"use client";

import { useCallback, useSyncExternalStore } from "react";
import { themeStore } from "@/lib/theme";
import type { Theme } from "@/lib/theme-config";

export function useTheme() {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  const setTheme = useCallback((next: Theme) => themeStore.setTheme(next), []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, isDark: theme === "dark", setTheme, toggleTheme };
}
