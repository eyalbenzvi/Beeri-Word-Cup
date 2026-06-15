import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Light/dark theme state. The actual class is applied to <html> by an inline
// script in index.html before first paint (no FOUC); this provider keeps React
// in sync, persists the user's explicit choice, and exposes a toggle.
//
// Default when the user hasn't chosen: follow the OS (prefers-color-scheme).
type Theme = "light" | "dark";
const THEME_KEY = "beeri:theme";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

function readInitialTheme(): Theme {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch { /* private mode — ignore */ }
  return "light";
}

export function ThemeProvider({ children }: { children: any }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  // Keep <html class="dark"> and the browser chrome colour in step with state.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#16181C" : "#58CC02");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Safe outside a provider (returns a light default + no-op) so isolated
// component tests don't need to wrap in ThemeProvider.
export function useTheme() {
  return useContext(ThemeContext) || { theme: "light" as Theme, toggleTheme: () => {} };
}
