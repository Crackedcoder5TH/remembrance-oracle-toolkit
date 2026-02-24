// Theme toggle system — dark/light/system with localStorage persistence
// Handles system preference detection, manual override, and runtime media query listener

type Theme = "dark" | "light" | "system";

const THEME_KEY = "cathedral-theme";

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function loadThemePreference(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {}
  return "system";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  if (resolved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function saveTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function cycleTheme(current: Theme): Theme {
  return current === "system" ? "light" : current === "light" ? "dark" : "system";
}

export { getSystemTheme, loadThemePreference, applyTheme, saveTheme, cycleTheme };
export type { Theme };
