"use client";

/**
 * Theme layer. Two full visual themes the user can switch between instantly:
 *   - "corporate": deep indigo/purple, boardroom hero — formal & executive.
 *   - "tech": emerald/teal, geometric hero — modern & technical.
 *
 * The active theme is written to <html data-theme="..."> so every CSS variable
 * in globals.css re-resolves and the WHOLE site re-skins at once. The choice is
 * persisted to localStorage so it survives reloads and applies on every page.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export const THEMES = ["corporate", "tech"] as const;
export type Theme = (typeof THEMES)[number];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("corporate");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("theme")) as Theme | null;
    if (stored && THEMES.includes(stored)) setThemeState(stored);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (typeof window !== "undefined") localStorage.setItem("theme", t);
  };

  const toggleTheme = () => setTheme(theme === "corporate" ? "tech" : "corporate");

  // Reflect the active theme on <html> so every CSS variable re-resolves.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
