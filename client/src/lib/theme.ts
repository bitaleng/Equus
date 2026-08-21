import { getCachedStoreProfile, storeIconUrl } from "@/lib/storeProfile";

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

  // 매장이 라이트/다크 전용 아이콘을 업로드해뒀으면 브라우저 탭/바로가기 아이콘도 테마에 맞게 교체
  // (PWA 설치 아이콘 자체는 manifest 단일 세트를 그대로 쓴다)
  const profile = getCachedStoreProfile();
  if (profile?.icons.faviconLight) {
    const iconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    const appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (iconLink) {
      iconLink.href = storeIconUrl(profile, theme === "dark" ? "favicon" : "favicon-light");
    }
    if (appleLink) {
      appleLink.href = storeIconUrl(profile, theme === "dark" ? "icon-192" : "icon-192-light");
    }
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
