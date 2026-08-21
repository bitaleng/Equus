export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ivansauna-theme";

const LIGHT_THEME_COLOR = "#f5f7fa";
const DARK_THEME_COLOR = "#0F172A";

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return "light";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR
    );
  }

  // V2: 브라우저 탭/바로가기 아이콘도 테마에 맞게 교체 (PWA 설치 아이콘은 manifest 단일 세트)
  const skin = (import.meta as any).env?.VITE_SKIN || "v1";
  if (skin === "v2") {
    const iconVer = "hes3";
    const favicon = theme === "dark" ? `/favicon.png?v=${iconVer}` : `/favicon-light.png?v=${iconVer}`;
    const apple = theme === "dark" ? `/icon-192.png?v=${iconVer}` : `/icon-192-light.png?v=${iconVer}`;
    const iconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    const appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (iconLink) iconLink.href = favicon;
    if (appleLink) appleLink.href = apple;
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
