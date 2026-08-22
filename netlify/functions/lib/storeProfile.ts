/**
 * 매장별 런타임 프로필 — 브랜딩(이름/아이콘)과 초기 설정값을 빌드타임이 아니라
 * 라이선스 활성화/동기화 시점에 서버가 내려주기 위한 공용 스키마.
 * license-bind.ts, store-profile-admin.ts, store-manifest.ts, store-icon.ts에서 공유한다.
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
  /** 앱 내부 사이드바에 쓰는 로고 (PWA 설치 아이콘과는 별개). */
  logo?: string;
}

export const ICON_VARIANTS = [
  "favicon",
  "favicon-light",
  "icon-192",
  "icon-192-light",
  "icon-512",
  "icon-512-light",
  "icon-1024",
  "icon-1024-light",
  "logo",
] as const;

export type IconVariant = (typeof ICON_VARIANTS)[number];

/** URL variant slug(kebab-case) → StoreIconSet 필드명(camelCase). */
const VARIANT_TO_ICON_SET_KEY: Record<IconVariant, keyof StoreIconSet> = {
  favicon: "favicon",
  "favicon-light": "faviconLight",
  "icon-192": "icon192",
  "icon-192-light": "icon192Light",
  "icon-512": "icon512",
  "icon-512-light": "icon512Light",
  "icon-1024": "icon1024",
  "icon-1024-light": "icon1024Light",
  logo: "logo",
};

export function iconSetKeyForVariant(variant: IconVariant): keyof StoreIconSet {
  return VARIANT_TO_ICON_SET_KEY[variant];
}

export interface StoreProfileRecord {
  storeId: string;
  displayName: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  icons: StoreIconSet;
  /** 아이콘을 재업로드할 때마다 올려서 캐시를 무효화한다. */
  iconVersion: string;
  /** 이 매장의 라이선스가 처음 활성화될 때 한 번만 로컬 설정에 반영되는 기본값. */
  settingsOverrides?: Record<string, unknown>;
  /**
   * 관리자가 매장과 합의한 뒤에만 켜는 "영구 오프라인 허용" 플래그.
   * true면 클라이언트(licenseBind.ts)가 14일 오프라인 유예기간 체크를 건너뛰고
   * 인터넷이 없어도 무기한 계속 사용을 허용한다 — store-admin.html에서만 켤 수 있고
   * 매장이 스스로 켤 수 있는 방법은 없다(반드시 관리자 조작 필요).
   */
  offlineModeEnabled?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function profileKey(storeId: string): string {
  return `profile:${storeId}`;
}

export function keymapKey(customerCode: string): string {
  return `keymap:${customerCode}`;
}

export function iconAssetKey(storeId: string, variant: string): string {
  return `icon:${storeId}:${variant}`;
}

/** storeId 슬러그 형식 검증 — 영소문자/숫자/하이픈만, 2~40자. */
export function isValidStoreId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{2,40}$/.test(value);
}

export function isValidIconVariant(value: unknown): value is IconVariant {
  return typeof value === "string" && (ICON_VARIANTS as readonly string[]).includes(value);
}
