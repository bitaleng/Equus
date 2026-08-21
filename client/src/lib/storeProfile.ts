/**
 * 매장별 런타임 브랜딩/설정 — 서버(license-bind.ts)가 라이선스 활성화·동기화 응답에
 * 함께 내려주는 매장 프로필을 캐싱하고, 문서 타이틀/파비콘/매니페스트/초기 설정값에 반영한다.
 * VITE_SKIN 빌드타임 분기를 대체한다.
 */

export interface StoreIconSet {
  favicon?: string;
  faviconLight?: string;
  icon192?: string;
  icon192Light?: string;
  icon512?: string;
  icon512Light?: string;
  icon1024?: string;
  icon1024Light?: string;
  logo?: string;
}

export interface StoreProfile {
  storeId: string;
  displayName: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  icons: StoreIconSet;
  iconVersion: string;
  settingsOverrides?: Record<string, unknown>;
  active: boolean;
}

const CACHE_KEY = "store_profile_cache_v1";
const SEEDED_STORE_KEY = "store_profile_seeded_storeid_v1";

/** 제네릭(활성화 전 기본값) — client/index.html에 박아둔 값과 동일하게 유지한다. */
export const GENERIC_PROFILE_FALLBACK = {
  displayName: "EQUUS LOCKER MANAGER",
  description: "락카 입실 현황을 실시간으로 관리합니다.",
};

export function getCachedStoreProfile(): StoreProfile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoreProfile;
  } catch {
    return null;
  }
}

/** variant는 "icon-192" | "favicon" | "logo" 같은 URL 슬러그. */
export function storeIconUrl(profile: StoreProfile, variant: string): string {
  return `/store/${encodeURIComponent(profile.storeId)}/icon/${variant}?v=${encodeURIComponent(profile.iconVersion)}`;
}

function storeManifestUrl(profile: StoreProfile): string {
  return `/store/${encodeURIComponent(profile.storeId)}/manifest.webmanifest`;
}

/** profile이 null이면 index.html의 기본(제네릭) 값으로 되돌린다. DOM 조작은 멱등적으로 처리. */
export function applyStoreProfile(profile: StoreProfile | null): void {
  if (typeof document === "undefined") return;

  if (!profile) {
    document.title = GENERIC_PROFILE_FALLBACK.displayName;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute("content", GENERIC_PROFILE_FALLBACK.description);
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (manifestLink) manifestLink.href = "/manifest.json";
    const iconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (iconLink) iconLink.href = "/favicon.png";
    const appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (appleLink) appleLink.href = "/icon-192.png";
    return;
  }

  document.title = profile.displayName;
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) descMeta.setAttribute("content", profile.description);

  const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (manifestLink) manifestLink.href = storeManifestUrl(profile);

  const iconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (iconLink && profile.icons.favicon) {
    iconLink.href = storeIconUrl(profile, "favicon");
  }
  const appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (appleLink && profile.icons.icon192) {
    appleLink.href = storeIconUrl(profile, "icon-192");
  }
}

export function cacheStoreProfile(profile: StoreProfile | null): void {
  try {
    if (profile) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // ignore
  }
  applyStoreProfile(profile);
}

/**
 * 최초 라이선스 활성화 때만 호출한다. 매장 프로필의 기본 설정값을 localStorage['settings']에
 * 병합하되, 이미 이 storeId로 시딩한 적이 있으면 건너뛴다 — 매장 주인이 나중에 직접 바꾼 값을
 * 다음 sync가 조용히 덮어쓰지 않도록 하기 위함이다. 기존 매장 마이그레이션 시에는 뒤이어
 * importDatabase()가 localStorage['settings']를 백업 내용으로 완전히 덮어쓰므로 충돌하지 않는다.
 */
export function seedSettingsFromProfileIfNeeded(profile: StoreProfile | null): void {
  if (!profile?.settingsOverrides) return;
  try {
    const lastSeededFor = localStorage.getItem(SEEDED_STORE_KEY);
    if (lastSeededFor === profile.storeId) return;
    const current = localStorage.getItem("settings");
    const merged = { ...(current ? JSON.parse(current) : {}), ...profile.settingsOverrides };
    localStorage.setItem("settings", JSON.stringify(merged));
    localStorage.setItem(SEEDED_STORE_KEY, profile.storeId);
  } catch {
    // ignore
  }
}
