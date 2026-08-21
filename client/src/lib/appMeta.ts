/** 앱 표시명 — 매장별 값은 라이선스 활성화 시 서버가 내려주는 런타임 프로필에서 온다. */

import { isDemoBuild } from "@/lib/demoMode";
import { getCachedStoreProfile, GENERIC_PROFILE_FALLBACK } from "@/lib/storeProfile";

const DEMO_META = {
  name: "입실관리 체험판",
  shortName: "체험",
  description: "관리자 시작 코드로 시작하는 체험판입니다.",
};

const GENERIC_META = {
  name: GENERIC_PROFILE_FALLBACK.displayName,
  shortName: "LOCKER",
  description: GENERIC_PROFILE_FALLBACK.description,
};

export function getAppName(): string {
  if (isDemoBuild()) return DEMO_META.name;
  const profile = getCachedStoreProfile();
  return profile?.displayName || GENERIC_META.name;
}

export function getAppShortName(): string {
  if (isDemoBuild()) return DEMO_META.shortName;
  const profile = getCachedStoreProfile();
  return profile?.shortName || GENERIC_META.shortName;
}

export function getAppDescription(): string {
  if (isDemoBuild()) {
    return "관리자 시작 코드로 시작하는 체험판입니다. 기본 10일(최대 30일 연장). 다른 기기에서는 자동으로 새 체험이 시작되지 않으며, 홈 화면 설치(PWA)는 지원하지 않습니다.";
  }
  const profile = getCachedStoreProfile();
  return profile?.description || GENERIC_META.description;
}
